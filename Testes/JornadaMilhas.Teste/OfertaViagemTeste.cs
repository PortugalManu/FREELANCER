using JornadaMilhasV1.Modelos;

namespace JornadaMilhas.Teste
{
    public class OfertaViagemTeste
    {
        [Fact]
        public void TestandoOfertaValida()
        {
            //Cenario - Arrange
            Rota rota = new Rota("OrigemTeste", "DesttinoTeste");
            Periodo periodo = new Periodo(new DateTime(2024, 2, 1), new DateTime(2024, 2, 5));
            double preco = 100.0;
            var validacao = true;

            //Ação - Act
            OfertaViagem oferta = new OfertaViagem(rota, periodo, preco);

            //Validação - Assert
            Assert.Equal(validacao, oferta.EhValido);
        }
    

     [Fact]
        public void TestandoOfertaComRotaNula()
        {
            //Cenario - Arrange
            Rota rota = null;
            Periodo periodo = new Periodo(new DateTime(2024, 2, 1), new DateTime(2024, 2, 5));
            double preco = 100.0;

            //Ação - Act
            OfertaViagem oferta = new OfertaViagem(rota, periodo, preco);

            //Validação - Assert
            Assert.Contains("A oferta de viagem não possui rota ou período válidos.", oferta.Erros.Sumario);
            Assert.False(oferta.EhValido);
        }

        [Fact]
        public void TestandoOfertaComPeriodoInvalido()
        {
            //Cenario - Arrange
            Rota rota = new Rota("OrigemTeste", "DestinoTeste");
            Periodo periodo = new Periodo(new DateTime(2024, 2, 5), new DateTime(2024, 2, 1));
            double preco = 100.0;

            //Ação - Act
            OfertaViagem oferta = new OfertaViagem(rota, periodo, preco);

            //Validação - Assert
            Assert.Contains("Erro: Data de ida não pode ser maior que a data de volta.", oferta.Erros.Sumario);
            Assert.False(oferta.EhValido);
        }
    }
}
